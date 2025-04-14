/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export interface Env {
	// D1 데이터베이스 바인딩 타입 정의
	DB: D1Database;
}

// 응답 형식을 위한 인터페이스
interface HitCountResponse {
	totalHits: number;
	totalUniqueHits: number;
	todayHits: number;
	todayUniqueHits: number;
	totalPageHits: number;
	totalPageUniqueHits: number;
	todayPageHits: number;
	todayPageUniqueHits: number;
}

// 날짜 포맷팅 함수
function getDateString(): string {
	const date = new Date();
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// 테이블 생성 함수
async function createTablesIfNeeded(db: D1Database): Promise<void> {
	try {
		// 히트 카운트 테이블 - 단순하게 재작성
		await db.exec("CREATE TABLE IF NOT EXISTS hits (id INTEGER PRIMARY KEY AUTOINCREMENT, host TEXT NOT NULL, path TEXT NOT NULL, visitor_id TEXT NOT NULL, date TEXT NOT NULL)");
		
		// 총 히트수 집계 테이블 - 단순하게 재작성
		await db.exec("CREATE TABLE IF NOT EXISTS hit_counts (host TEXT NOT NULL, path TEXT NOT NULL, total_hits INTEGER DEFAULT 0, total_unique_hits INTEGER DEFAULT 0, PRIMARY KEY (host, path))");
		
		// 일별 히트수 집계 테이블 - 단순하게 재작성
		await db.exec("CREATE TABLE IF NOT EXISTS daily_hit_counts (host TEXT NOT NULL, path TEXT NOT NULL, date TEXT NOT NULL, daily_hits INTEGER DEFAULT 0, daily_unique_hits INTEGER DEFAULT 0, PRIMARY KEY (host, path, date))");
		
		console.log("Tables created successfully");
	} catch (e) {
		console.error("Error creating tables:", e);
	}
}

// 방문 기록 저장 함수
async function recordHit(db: D1Database, host: string, path: string, visitorId: string, date: string): Promise<void> {
	try {
		console.log(`Recording hit for ${host}${path} from visitor ${visitorId} on ${date}`);
		
		// 방문 이력 저장
		await db.prepare(
			"INSERT INTO hits (host, path, visitor_id, date) VALUES (?, ?, ?, ?)"
		).bind(host, path, visitorId, date).run();
		console.log("Inserted into hits table");
		
		// 총 방문수 업데이트
		// 쿼리 단순화: 서브쿼리 제거
		await db.prepare(
			"INSERT INTO hit_counts (host, path, total_hits, total_unique_hits) VALUES (?, ?, 1, 1) ON CONFLICT (host, path) DO UPDATE SET total_hits = total_hits + 1"
		).bind(host, path).run();
		console.log("Updated hit_counts table");
		
		// 일별 방문수 업데이트
		// 쿼리 단순화: 서브쿼리 제거
		await db.prepare(
			"INSERT INTO daily_hit_counts (host, path, date, daily_hits, daily_unique_hits) VALUES (?, ?, ?, 1, 1) ON CONFLICT (host, path, date) DO UPDATE SET daily_hits = daily_hits + 1"
		).bind(host, path, date).run();
		console.log("Updated daily_hit_counts table");

		// 유니크 방문자 집계 - 별도 쿼리로 분리
		await updateUniqueHits(db, host, path, date);
		
	} catch (e) {
		console.error("Error recording hit:", e);
	}
}

// 유니크 방문자 수 업데이트 함수 (별도로 분리)
async function updateUniqueHits(db: D1Database, host: string, path: string, date: string): Promise<void> {
	try {
		// 총 유니크 방문자 수 업데이트
		const totalUniqueCount = await db.prepare(
			"SELECT COUNT(DISTINCT visitor_id) as count FROM hits WHERE host = ? AND path = ?"
		).bind(host, path).first<{count: number}>();
		
		await db.prepare(
			"UPDATE hit_counts SET total_unique_hits = ? WHERE host = ? AND path = ?"
		).bind(totalUniqueCount?.count || 0, host, path).run();
		
		// 오늘 유니크 방문자 수 업데이트
		const todayUniqueCount = await db.prepare(
			"SELECT COUNT(DISTINCT visitor_id) as count FROM hits WHERE host = ? AND path = ? AND date = ?"
		).bind(host, path, date).first<{count: number}>();
		
		await db.prepare(
			"UPDATE daily_hit_counts SET daily_unique_hits = ? WHERE host = ? AND path = ? AND date = ?"
		).bind(todayUniqueCount?.count || 0, host, path, date).run();
		
		console.log("Updated unique hits counts");
	} catch (e) {
		console.error("Error updating unique hits:", e);
	}
}

// 방문 통계 가져오기 함수
async function getStats(db: D1Database, host: string, path: string, today: string): Promise<HitCountResponse> {
	try {
		console.log(`Getting stats for ${host}${path}, today: ${today}`);
		
		// 호스트 전체 통계 (모든 페이지)
		const hostTotalStats = await db.prepare(
			"SELECT SUM(total_hits) as total_hits, SUM(total_unique_hits) as total_unique_hits FROM hit_counts WHERE host = ?"
		).bind(host).first<{total_hits: number, total_unique_hits: number}>();
		console.log("Host total stats:", hostTotalStats);
		
		// 호스트 오늘 통계 (모든 페이지)
		const hostTodayStats = await db.prepare(
			"SELECT SUM(daily_hits) as daily_hits, SUM(daily_unique_hits) as daily_unique_hits FROM daily_hit_counts WHERE host = ? AND date = ?"
		).bind(host, today).first<{daily_hits: number, daily_unique_hits: number}>();
		console.log("Host today stats:", hostTodayStats);
		
		// 특정 페이지 총 통계
		const pageTotalStats = await db.prepare(
			"SELECT total_hits, total_unique_hits FROM hit_counts WHERE host = ? AND path = ?"
		).bind(host, path).first<{total_hits: number, total_unique_hits: number}>();
		console.log("Page total stats:", pageTotalStats);
		
		// 특정 페이지 오늘 통계
		const pageTodayStats = await db.prepare(
			"SELECT daily_hits, daily_unique_hits FROM daily_hit_counts WHERE host = ? AND path = ? AND date = ?"
		).bind(host, path, today).first<{daily_hits: number, daily_unique_hits: number}>();
		console.log("Page today stats:", pageTodayStats);
		
		return {
			// 호스트 전체 통계
			totalHits: hostTotalStats?.total_hits || 0,
			totalUniqueHits: hostTotalStats?.total_unique_hits || 0,
			todayHits: hostTodayStats?.daily_hits || 0,
			todayUniqueHits: hostTodayStats?.daily_unique_hits || 0,
			
			// 특정 페이지 통계
			totalPageHits: pageTotalStats?.total_hits || 0,
			totalPageUniqueHits: pageTotalStats?.total_unique_hits || 0,
			todayPageHits: pageTodayStats?.daily_hits || 0,
			todayPageUniqueHits: pageTodayStats?.daily_unique_hits || 0
		};
	} catch (e) {
		console.error("Error getting stats:", e);
		return {
			totalHits: 0,
			totalUniqueHits: 0,
			todayHits: 0,
			todayUniqueHits: 0,
			totalPageHits: 0,
			totalPageUniqueHits: 0,
			todayPageHits: 0,
			todayPageUniqueHits: 0
		};
	}
}

// 전체 통계 가져오기 함수 (경로 구분 없이 모든 데이터)
async function getTotalStats(db: D1Database, today: string): Promise<HitCountResponse> {
	try {
		console.log("Getting total stats for all hosts and paths");
		
		// 전체 방문 통계 - JOIN 없이 직접 SUM 사용
		const totalStats = await db.prepare(
			"SELECT SUM(total_hits) as total_hits, SUM(total_unique_hits) as total_unique_hits FROM hit_counts"
		).first<{total_hits: number, total_unique_hits: number}>();
		console.log("Total stats:", totalStats);
		
		// 오늘 전체 방문 통계 - JOIN 없이 직접 SUM 사용
		const todayStats = await db.prepare(
			"SELECT SUM(daily_hits) as daily_hits, SUM(daily_unique_hits) as daily_unique_hits FROM daily_hit_counts WHERE date = ?"
		).bind(today).first<{daily_hits: number, daily_unique_hits: number}>();
		console.log("Today total stats:", todayStats);
		
		// 유니크 방문자 수 보정
		// 실제로 전체 유니크 방문자는 hits 테이블에서 직접 계산해야 함
		const totalUniqueStats = await db.prepare(
			"SELECT COUNT(DISTINCT visitor_id) as count FROM hits"
		).first<{count: number}>();
		
		const todayUniqueStats = await db.prepare(
			"SELECT COUNT(DISTINCT visitor_id) as count FROM hits WHERE date = ?"
		).bind(today).first<{count: number}>();
		
		return {
			totalHits: totalStats?.total_hits || 0,
			totalUniqueHits: totalUniqueStats?.count || 0, // 직접 계산한 전체 유니크 방문자 사용
			todayHits: todayStats?.daily_hits || 0,
			todayUniqueHits: todayUniqueStats?.count || 0, // 직접 계산한 오늘 유니크 방문자 사용
			totalPageHits: 0,
			totalPageUniqueHits: 0,
			todayPageHits: 0,
			todayPageUniqueHits: 0
		};
	} catch (e) {
		console.error("Error getting total stats:", e);
		return {
			totalHits: 0,
			totalUniqueHits: 0,
			todayHits: 0,
			todayUniqueHits: 0,
			totalPageHits: 0,
			totalPageUniqueHits: 0,
			todayPageHits: 0,
			todayPageUniqueHits: 0
		};
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// 테이블 생성 (첫 실행시에만 필요)
		await createTablesIfNeeded(env.DB);
		
		// URL과 Referer 파싱
		const url = new URL(request.url);
		const referer = request.headers.get('Referer') || '';
		
		// URL 파라미터 체크 (url 파라미터가 있으면 Referer보다 우선)
		const urlParam = url.searchParams.get('url');
		// hostname과 pathname 개별 파라미터 체크
		const hostnameParam = url.searchParams.get('hostname');
		const pathnameParam = url.searchParams.get('pathname');
		
		// 통계 조회 모드 (all 파라미터가 있으면 전체 통계 모드)
		const showAllStats = url.searchParams.get('all') === 'true';
		
		// Referer가 없거나 유효하지 않은 경우 기본값 사용
		let refererHost = 'unknown-host';
		let refererPath = '/unknown-path';
		let isValidReferer = false;
		
		// URL 파라미터 확인 (우선순위 1)
		if (urlParam) {
			try {
				const parsedUrl = new URL(urlParam);
				refererHost = parsedUrl.hostname;
				refererPath = parsedUrl.pathname;
				isValidReferer = true;
			} catch (e) {
				console.error('Invalid URL parameter:', urlParam);
			}
		} 
		// hostname과 pathname 개별 파라미터 확인 (우선순위 2)
		else if (hostnameParam) {
			refererHost = hostnameParam;
			if (pathnameParam) {
				refererPath = pathnameParam.startsWith('/') ? pathnameParam : '/' + pathnameParam;
			}
			isValidReferer = true;
		}
		// Referer 헤더 확인 (우선순위 3)
		else if (referer) {
			try {
				const refererUrl = new URL(referer);
				refererHost = refererUrl.hostname;
				refererPath = refererUrl.pathname;
				isValidReferer = true;
			} catch (e) {
				console.error('Invalid referer format:', referer);
			}
		}
		
		// 유니크 방문자 식별을 위한 쿠키 체크
		const cookies = request.headers.get('Cookie') || '';
		let visitorId = '';
		const visitorIdMatch = cookies.match(/visitorId=([^;]+)/);
		
		if (visitorIdMatch && visitorIdMatch[1]) {
			visitorId = visitorIdMatch[1];
		} else {
			// 새 방문자 ID 생성
			visitorId = crypto.randomUUID();
		}
		
		// 방문 기록 저장 (유효한 Referer가 있는 경우만)
		const today = getDateString();
		if (isValidReferer) {
			await recordHit(env.DB, refererHost, refererPath, visitorId, today);
		}
		
		// 집계된 방문 통계 가져오기
		let stats: HitCountResponse;
		if (showAllStats || !isValidReferer) {
			// 전체 통계 가져오기 (referer가 유효하지 않거나 all=true인 경우)
			stats = await getTotalStats(env.DB, today);
		} else {
			// 특정 경로 통계 가져오기 (기본)
			stats = await getStats(env.DB, refererHost, refererPath, today);
		}
		
		// JSONP 또는 일반 JSON 응답 형식 결정
		const callback = url.searchParams.get('callback');
		const isJSONP = url.pathname.includes('/jsonp') || callback !== null;
		
		if (isJSONP && callback) {
			// JSONP 응답
			return new Response(
				`${callback}(${JSON.stringify(stats)})`,
				{
					headers: {
						'Content-Type': 'text/javascript',
						'Set-Cookie': `visitorId=${visitorId}; path=/; max-age=31536000; SameSite=None; Secure`
					}
				}
			);
		} else {
			// 일반 JSON 응답
			return new Response(
				JSON.stringify(stats),
				{
					headers: {
						'Content-Type': 'application/json',
						'Set-Cookie': `visitorId=${visitorId}; path=/; max-age=31536000; SameSite=None; Secure`
					}
				}
			);
		}
	},
} satisfies ExportedHandler<Env>;
