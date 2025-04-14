# Hit Counter API

Cloudflare Workers와 D1 데이터베이스를 사용한 간단한 방문자 카운터 API입니다.

## 기능

- 웹사이트 방문자 수 추적
- 총 방문자 수 및 고유 방문자 수 집계
- 하루 방문자 수 및 고유 방문자 수 집계
- 사이트 전체 및 특정 페이지별 통계 제공
- 쿠키 기반 고유 방문자 식별
- JSONP 및 JSON 응답 지원
- URL 파라미터 지원 (Referer가 없는 경우)
- hostname과 pathname 개별 파라미터 지원
- 전체 데이터 통계 제공 기능

## 사용법

### 일반 JSON 응답 (fetch API 사용)

```javascript
// 클라이언트 코드
async function getStats() {
  const response = await fetch('https://your-worker-url.workers.dev/');
  const stats = await response.json();
  console.log(stats);
  // {
  //   // 사이트 전체 통계
  //   totalHits: 42,          // 전체 사이트 총 방문 수
  //   totalUniqueHits: 15,    // 전체 사이트 총 유니크 방문 수
  //   todayHits: 5,           // 전체 사이트 오늘 방문 수
  //   todayUniqueHits: 3,     // 전체 사이트 오늘 유니크 방문 수
  //
  //   // 특정 페이지 통계
  //   totalPageHits: 12,         // 현재 페이지 총 방문 수
  //   totalPageUniqueHits: 8,    // 현재 페이지 총 유니크 방문 수
  //   todayPageHits: 3,          // 현재 페이지 오늘 방문 수
  //   todayPageUniqueHits: 2     // 현재 페이지 오늘 유니크 방문 수
  // }
}
```

### URL 파라미터 사용 (Referer가 없거나 사용할 수 없는 경우)

```javascript
// 클라이언트 코드
async function getStats() {
  // URL 파라미터로 사이트 정보 전달
  const currentUrl = encodeURIComponent('https://example.com/blog/post-1');
  const response = await fetch(`https://your-worker-url.workers.dev/?url=${currentUrl}`);
  const stats = await response.json();
  console.log(stats);
}
```

### hostname과 pathname 개별 파라미터 사용

```javascript
// 클라이언트 코드
async function getStats() {
  const hostname = 'example.com';
  const pathname = '/blog/post-1';
  const response = await fetch(`https://your-worker-url.workers.dev/?hostname=${hostname}&pathname=${pathname}`);
  const stats = await response.json();
  console.log(stats);
}
```

### 전체 데이터 통계 가져오기

```javascript
// 클라이언트 코드
async function getAllStats() {
  // all=true 파라미터로 모든 데이터 통계 요청
  const response = await fetch('https://your-worker-url.workers.dev/?all=true');
  const stats = await response.json();
  console.log("전체 방문자 수:", stats.totalHits);
  console.log("전체 유니크 방문자 수:", stats.totalUniqueHits);
}
```

### JSONP 응답 (스크립트 태그 사용)

```html
<!-- 클라이언트 코드 -->
<script>
function handleStats(stats) {
  console.log(stats);
  // 사이트 전체 및 페이지별 통계 정보 포함
}
</script>
<script src="https://your-worker-url.workers.dev/jsonp?callback=handleStats"></script>
```

### URL 파라미터와 JSONP 함께 사용

```html
<!-- 클라이언트 코드 -->
<script>
function handleStats(stats) {
  console.log(stats);
}
</script>
<script src="https://your-worker-url.workers.dev/jsonp?callback=handleStats&url=https://example.com/blog/post-1"></script>
```

### hostname, pathname 파라미터와 JSONP 함께 사용

```html
<!-- 클라이언트 코드 -->
<script>
function handleStats(stats) {
  console.log(stats);
}
</script>
<script src="https://your-worker-url.workers.dev/jsonp?callback=handleStats&hostname=example.com&pathname=/blog/post-1"></script>
```

### 전체 통계를 JSONP로 가져오기

```html
<!-- 클라이언트 코드 -->
<script>
function handleTotalStats(stats) {
  console.log("전체 방문자 수:", stats.totalHits);
  console.log("전체 유니크 방문자 수:", stats.totalUniqueHits);
}
</script>
<script src="https://your-worker-url.workers.dev/jsonp?callback=handleTotalStats&all=true"></script>
```

## 데이터베이스 구조

서비스는 다음 3개의 테이블을 사용합니다:

1. `hits` - 모든 방문 기록 저장
2. `hit_counts` - 사이트/경로별 총 방문자 수 저장 
3. `daily_hit_counts` - 사이트/경로별 일별 방문자 수 저장

## 개발 및 배포

### 로컬 개발

```bash
npm run dev
```

### 배포

```bash
npm run deploy
```