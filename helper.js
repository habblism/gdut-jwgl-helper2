// ==UserScript==
// @name         gdut-jwgl-helper2
// @namespace    https://github.com/dgeibi/gdut-jwgl-helper2
// @version      0.3.0
// @description  make http://222.200.98.147/ better.
// @copyright    2013-2016 VTM STUDIO
// @copyright    2017 dgeibi
// @match        http://222.200.98.147/*

// ==/UserScript==

var courseBlackList = [];

// https://github.com/vtmer/gdut-jwgl-helper
var page = {
  routes: {},
  beforeRoutes: [],
  before: function (callback) {
    this.beforeRoutes.push(callback);
    return this;
  },
  on: function (pattern, callback) {
    var compiledPattern;
    var key = pattern.toString();
    if (!(key in this.routes)) {
      if (pattern instanceof RegExp) {
        compiledPattern = pattern;
      } else {
        compiledPattern = new RegExp('^' + key + '$');
      }

      this.routes[key] = {
        regExp: compiledPattern,
        callbacks: [],
      };
    }
    this.routes[key].callbacks.push(callback);
    return this;
  },
  run: function (url) {
    // 默认使用不带最开始 back slash 的 `location.pathname`
    url = url || location.pathname.slice(1, location.pathname.length);
    // 执行预先运行的回调函数组
    this.beforeRoutes.forEach(function (callback) {
      callback();
    });

    // 检查是否有满足条件的回调函数
    var foundMatched = false;
    var self = this;
    Object.keys(this.routes).forEach(function (pattern) {
      var route = self.routes[pattern];
      if (!route.regExp.test(url)) return;
      foundMatched = true;
      route.callbacks.forEach(function (callback) {
        callback();
      });
    });
    return foundMatched;
  },
};

function download(url, filename) {
  var link = document.createElement('a');
  if (link.download !== undefined) {
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    var event = new MouseEvent('click');
    link.dispatchEvent(event);
  }
}

var GPA = {
  // 等级对应成绩
  //
  // - 免修、优秀： 95
  // - 良好：85
  // - 中等：75
  // - 及格：65
  // - 不及格： 0
  // - 重修：0
  realScore: function (score) {
    if (score === '免修') return 95;
    else if (score === '优秀') return 95;
    else if (score === '良好') return 85;
    else if (score === '中等') return 75;
    else if (score === '及格') return 65;
    else if (score === '不及格') return 0;
    // 没有填写的情况当作 0 （出现在重修栏）
    else if (score === '') return 0;
    else return parseFloat(score);
  },

  // 从分数或等级计算绩点
  //
  // 绩点计算公式：
  //
  //      GPA = (s - 50) / 10         (s >= 60)
  //            0                     (s < 60)
  fromScoreOrGradeLevel: function (score) {
    score = GPA.realScore(score);

    return (score < 60) ? 0 : ((score - 50) / 10);
  },

  // 计算一门课程的学分绩点
  //
  // 计算公式：
  //
  //      CreditGPA = Credit * GPA
  creditGPA: function (lecture) { return lecture.credit * lecture.gpa; },

  // 计算若干门课程的总绩点
  sumCredit: function (lectures) {
    return lectures.reduce(function (sum, lecture) {
      return sum + lecture.credit;
    }, 0);
  },

  // 计算若干门课程的平均分
  avgScore: function (lectures) {
    if (lectures.length === 0) {
      return 0;
    }

    return lectures.reduce(function (sum, lecture) {
      return sum + GPA.realScore(lecture.grade.score);
    }, 0) / lectures.length;
  },

  // 计算若干门课程的平均学分绩点
  avgCreditGPA: function (lectures) {
    if (lectures.length === 0) {
      return 0;
    }

    var sumCreditGPA = lectures.reduce(function (sum, lecture) {
      return sum + GPA.creditGPA(lecture);
    }, 0);

    return sumCreditGPA / GPA.sumCredit(lectures);
  },

  // 计算若干门课程的加权平均分
  avgWeightedScore: function (lectures) {
    if (lectures.length === 0) {
      return 0;
    }

    var sumWeighedScore = lectures.reduce(function (sum, lecture) {
      return sum + lecture.credit * GPA.realScore(lecture.grade.score);
    }, 0);

    return sumWeighedScore / GPA.sumCredit(lectures);
  }
};

// ## 课程成绩记录定义
//
// * code        :  课程代码
// * name        :  课程名称
// * type        :  课程性质（公共基础？专业基础？）
// * attribution :  课程归属（人文社科？工程基础？）
// * grade:
//    - score    :  课程成绩
//    - type     :  考试类型
// * credit      :  学分
// * gpa         :  绩点
function Lecture() {
  this.code = null;
  this.name = null;
  this.type = null;
  this.attribution = null;
  this.isMinor = false;
  this.credit = 0.0;
  this.grade = {
    score: 0.0,
    type: null,
  };
  this.gpa = 0.0;
}

// 从 `table tr` 中获取一个课程信息
Lecture.fromTableRow = function (row) {
  var parseText = function (x) { return $(x).text().trim(); };

  var parseFloatOrText = function (x) {
    var parsedText = parseText(x),
      parsedFloat = parseFloat(parsedText);
    return isNaN(parsedFloat) ? parsedText : parsedFloat;
  };

  var $cols = $('td', row);
  var lecture = new Lecture();
  var takeFromRows = function (idx, parser) { return parser($cols[idx]); };

  lecture.code = takeFromRows(3, parseText);
  lecture.name = takeFromRows(4, parseText);
  lecture.grade.score = takeFromRows(5, parseFloatOrText) || 0.0;
  lecture.gpa = takeFromRows(6, parseFloatOrText) || 0.0;
  lecture.credit = takeFromRows(8, parseFloatOrText);
  lecture.type = takeFromRows(9, parseText);
  lecture.attribution = takeFromRows(10, parseText);
  lecture.grade.type = takeFromRows(13, parseText);

  return lecture;
};

// 从 `table` 中获取一系列课程信息
Lecture.fromRows = function (rows) {
  return $.map(rows, Lecture.fromTableRow);
};

page.on(/^xskccjxx!xskccjList\.action/, function () {
  // 页面元素
  var $infoRows = $('#tb table tbody');
  var $scoreTableHead = $('table.datagrid-htable tbody tr');

  $('#tb').height('auto');

  // 插入汇总栏: 平均绩点、平均分、加权平均分
  var $avgRow = $('<tr></tr>').appendTo($infoRows);
  var $avgGPA = $('<td class="avg-gpa" ></td>').appendTo($avgRow);
  var $avgScore = $('<td class="avg-score"></td>').appendTo($avgRow);
  var $weightedAvgScore = $('<td class="weighted-avg-score"></td>').appendTo($avgRow);

  // 表头
  $('<td style="width: 50px; text-align: center;">学分绩点</td>').appendTo($scoreTableHead);
  $('<td style="width: 50px; text-align: center;">全选 <input type="checkbox" class="lecture-check-all" checked /></td>').appendTo($scoreTableHead);

  // 各行
  var rowCellsTmpl = [
    '<td class="credit-gpa" style="width: 50px; text-align: center;"></td>',
    '<td style="width: 50px; text-align: center;"><input type="checkbox" class="lecture-check" /></td>'
  ];

  // 重新计算汇总成绩
  var renderSummarize = function () {
    var checkedRows = $('.lecture-check:checked').parent().parent();
    var lectures = Lecture.fromRows(checkedRows);

    $avgGPA.text('平均绩点: ' + GPA.avgCreditGPA(lectures).toFixed(2));
    $avgScore.text('平均分: ' + GPA.avgScore(lectures).toFixed(2));
    $weightedAvgScore.text('加权平均分: ' + GPA.avgWeightedScore(lectures).toFixed(2));
  };

  $('.lecture-check-all').change(function () {
    // 同步勾选状态
    $('.lecture-check').prop('checked', $('.lecture-check-all').is(':checked'));

    // 触发重新计算汇总栏
    renderSummarize();
  });

  function afterLoad(event, xhr, settings) {
    if (settings.url !== "xskccjxx!getDataList.action") return;
    var $scoreRows = $('table.datagrid-btable tbody tr');

    // 课程信息
    var lectures = Lecture.fromRows($scoreRows);

    // 插入各行汇总栏: 学分绩点、是否加入计算
    $(rowCellsTmpl.join('')).appendTo($scoreRows);

    $scoreRows.each(function (i, row) {
      var $row = $(row);
      var lecture = lectures[i];
      $row.find('.credit-gpa').text(GPA.creditGPA(lecture).toFixed(2));
    });

    // 绑定各栏的勾选事件
    $scoreRows.click(function (e) {
      var $target = $(e.target);
      if ($target.is('.l-btn-text') || $target.is('.lecture-check')) return;
      var $checkbox = $(this).find('input.lecture-check');
      $checkbox.prop('checked', !$checkbox.prop('checked')).trigger('change');
    });

    $('.lecture-check').change(renderSummarize);
    $('.lecture-check-all').trigger('change');
  }
  $(document).ajaxSuccess(afterLoad);
});

page.on(/^xsgrkbcx!xskbList2\.action/, function () {
  var courseStartTimes = ['08:30', '09:20', '10:25', '11:15', '13:50', '14:40', '15:30', '16:30', '17:20', '18:30', '19:20', '20:10'];
  var courseEndTimes = ['09:15', '10:05', '11:10', '12:00', '14:35', '15:25', '16:15', '17:15', '18:05', '19:15', '20:05', '20:55'];
  var bottomRow = document.getElementsByClassName('datagrid-pager')[0].children[0].children[0].rows[0];
  var select = bottomRow.cells[0].children[0];
  /* eslint-disable no-param-reassign */
  [].forEach.call(select.options, function (option) {
    option.innerText = '1000';
  });
  /* eslint-enable no-param-reassign */

  // click Refresh Button
  bottomRow.cells[12].children[0].click();

  // create Export Button
  var exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.style.cursor = 'pointer';
  exportBtn.innerText = '导出课表';
  exportBtn.onclick = exportICS;

  // append Export Button
  var cell = document.createElement('td');
  cell.align = 'right';
  cell.appendChild(exportBtn);
  var topRow = document.getElementById('ff').children[0].rows[0];
  topRow.insertAdjacentElement('afterbegin', cell);

  // getTime("2017-03-09","08:30") => "20170309T003000Z"
  function getTime(dateStr, timeStr) {
    var date = new Date(dateStr + 'T' + timeStr + ':00+08:00');
    return date.toISOString().replace(/\.\d\d\d/, '').replace(/[-:]/g, '');
  }

  function exportICS() {
    var table = document.querySelector('.datagrid-body .datagrid-btable');
    var filename = 'course' + Date.now() + '.ics';
    var url = 'data:text/calendar;charset=utf-8,';
    var ics = 'BEGIN:VCALENDAR\n' +
      'PRODID:-//dgeibi/gdut-jwgl-helper//Calendar 1.0//EN\n' +
      'VERSION:2.0\n' +
      'CALSCALE:GREGORIAN\n' +
      'METHOD:PUBLISH\n' +
      'X-WR-CALNAME:课程表\n' +
      'X-WR-TIMEZONE:Asia/Shanghai\n';

    [].forEach.call(table.rows, function (row) {
      var cells = row.cells;
      var date = cells[8].firstChild.innerText;
      var orderRaw = cells[6].firstChild.innerText;
      var startOrder = orderRaw.slice(0, 2) - 1;
      var endOrder = orderRaw.slice(-2) - 1;
      var courseStartTime = courseStartTimes[startOrder];
      var courseEndTime = courseEndTimes[endOrder];
      var location = cells[7].firstChild.innerText;
      var courseName = cells[0].firstChild.innerText;
      var weekCount = cells[4].firstChild.innerText;
      var teacher = cells[3].firstChild.innerText;

      if (courseBlackList.indexOf(courseName) >= 0) return;
      ics += 'BEGIN:VEVENT\n';
      ics += 'DTSTART:' + getTime(date, courseStartTime) + '\n';
      ics += 'DTEND:' + getTime(date, courseEndTime) + '\n';
      ics += 'LOCATION:' + location + '\n';
      ics += 'SUMMARY:' + courseName + '\n';
      ics += 'DESCRIPTION:' + '第' + weekCount + '周\\n' + teacher + '\n';
      ics += 'END:VEVENT' + '\n';
    });
    ics += 'END:VCALENDAR\n';
    url += encodeURIComponent(ics);

    // download ics file
    download(url, filename);
  }
});

page.run();
