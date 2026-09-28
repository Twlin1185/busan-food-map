#!/usr/bin/env node
/*
 * 카카오 로컬 API로 가게를 찾아 PLACES에 넣을 값(id, 좌표, 주소)을 뽑아준다.
 *
 *   node scripts/kakao-place.js "쌍교숯불갈비 송정점"
 *   node scripts/kakao-place.js "한중양꼬치" --near 광주
 *
 * REST API 키는 둘 중 하나에서 읽는다 (환경변수가 우선):
 *   1) 환경변수 KAKAO_REST_API_KEY
 *   2) %USERPROFILE%\.config\kakao.env 파일의  KAKAO_REST_API_KEY=키값  줄
 * 키 발급: https://developers.kakao.com → 내 애플리케이션 → 앱 키 → REST API 키
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const KEY_FILE = path.join(os.homedir(), '.config', 'kakao.env');

function loadKey() {
  if (process.env.KAKAO_REST_API_KEY) return process.env.KAKAO_REST_API_KEY.trim();
  try {
    const line = fs.readFileSync(KEY_FILE, 'utf8').split(/\r?\n/).find(l => l.startsWith('KAKAO_REST_API_KEY='));
    if (line) return line.slice('KAKAO_REST_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
  } catch (_) {}
  return '';
}

const args = process.argv.slice(2);
const nearIdx = args.indexOf('--near');
const near = nearIdx >= 0 ? args.splice(nearIdx, 2)[1] : '';
const query = args.join(' ').trim();
if (!query) {
  console.error('사용법: node scripts/kakao-place.js "가게 이름" [--near 지역]');
  process.exit(2);
}

const key = loadKey();
if (!key) {
  console.error('카카오 REST API 키가 없습니다.');
  console.error('  ' + KEY_FILE + ' 파일에  KAKAO_REST_API_KEY=키값  한 줄을 넣거나,');
  console.error('  환경변수 KAKAO_REST_API_KEY 를 설정하세요.');
  process.exit(1);
}

(async () => {
  const q = near ? near + ' ' + query : query;
  const url = 'https://dapi.kakao.com/v2/local/search/keyword.json?size=5&query=' + encodeURIComponent(q);
  const res = await fetch(url, { headers: { Authorization: 'KakaoAK ' + key } });
  if (!res.ok) {
    console.error('요청 실패 HTTP ' + res.status + ': ' + (await res.text()).slice(0, 300));
    process.exit(1);
  }
  const docs = (await res.json()).documents;
  if (!docs.length) { console.log('검색 결과 없음: ' + q); return; }
  docs.forEach((d, i) => {
    const [rawRegion, gu, ...rest] = (d.address_name || '').split(' ');
    // "전남광주통합특별시" → "광주", "부산광역시" → "부산" 처럼 기존 PLACES 표기로 줄인다
    const region = rawRegion.replace(/^전남광주.*$/, '광주').replace(/(광역시|특별시|특별자치시|특별자치도|통합특별시|도)$/, '');
    console.log(`\n[${i + 1}] ${d.place_name}  (${d.category_name})`);
    console.log('   도로명: ' + d.road_address_name + '   지번: ' + d.address_name);
    console.log('   PLACES 값:');
    console.log('   ' + JSON.stringify({
      region,
      gu, dong: rest[0] || '',
      address: d.road_address_name.replace(/^\S+/, region),
      category: d.category_name,
      kakao: 'https://place.map.kakao.com/' + d.id,
      x: d.x, y: d.y,
    }));
  });
})().catch(e => { console.error(e.message); process.exit(1); });
