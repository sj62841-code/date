# DATE OS v3 — 실제 API 연결 버전

기존 클릭 프로토타입을 실제 장소/교통/날씨 API를 호출할 수 있는 서버 구조로 바꾼 버전입니다.

## 연결 구조

- 장소/지역 검색: Kakao Local REST API
- 대중교통: Kakao Map Public Traffic Routing
- 도보: Kakao Map Walking Routing
- 자차: Kakao Mobility Directions
- 날씨: 기상청 단기예보 (공공데이터포털)
- ODsay: 현재 핵심 경로에서는 사용하지 않음. 추후 보조/검증용으로 연결 가능

API 키는 브라우저 코드에 넣지 않습니다. `/api/*` 서버 함수가 환경변수에서 키를 읽고 외부 API를 호출합니다.

## 환경변수

`.env.example`을 복사해 `.env.local`을 만들고 아래 값을 넣습니다.

```env
KAKAO_REST_API_KEY=...
KMA_SERVICE_KEY=...
ODSAY_API_KEY=... # 선택
```

기상청 키는 Encoding 키/Decoding 키 어느 쪽이든 받을 수 있도록 서버에서 처리합니다.

## 로컬 실행

Node.js 18 이상에서:

```bash
npm run dev
```

그 후 브라우저에서 `http://localhost:4173`을 엽니다.

## Vercel 배포

프로젝트를 Vercel에 올린 뒤 Project Settings > Environment Variables에 다음을 등록합니다.

- `KAKAO_REST_API_KEY`
- `KMA_SERVICE_KEY`
- `ODSAY_API_KEY` (선택)

키를 프론트엔드 환경변수(`NEXT_PUBLIC_*` 등)로 만들면 안 됩니다.

## API 상태 확인

앱의 `MY > API 연결 상태`에서 다음 연결을 서버에서 직접 점검합니다.

- 카카오 장소
- 카카오 대중교통
- 카카오 자차
- 기상청 날씨

자동차만 경고가 뜨면 Kakao Mobility Navi API 사용 가능 여부를 확인하세요. 자동차 API가 불가할 때 앱은 거리 기반 예상값으로 임시 동작하며 이를 화면에 표시합니다.

## 현재 가격 처리

카카오 장소 API는 대부분 매장의 실제 메뉴 가격을 제공하지 않습니다. 따라서:

- 장소명/주소/좌표: 실제 API 데이터
- 이동시간/교통비: 실제 경로 API 데이터
- 식당/카페 예상 지출: 2인 기준 카테고리별 예상치
- 전시/공방 등 실제 가격 데이터가 확보되는 경우: 이후 실가격 소스로 교체

예상치와 실제 데이터를 UI에서 혼동하지 않도록 구분했습니다.

## 보안

`.env.local`은 `.gitignore` 대상이며 배포 ZIP에도 포함하지 않았습니다. 개발용 키를 운영 서비스에 그대로 쓰기보다 출시 전에 운영용 키를 새로 만들고 제한 설정을 적용하는 것을 권장합니다.
